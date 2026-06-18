package main

import (
	"context"
	"encoding/json"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/YHQZ1/kprobe/api/auth"
	apiconsumer "github.com/YHQZ1/kprobe/api/consumer"
	"github.com/YHQZ1/kprobe/api/handlers"
	apimetrics "github.com/YHQZ1/kprobe/api/metrics"
	pb "github.com/YHQZ1/kprobe/api/proto"
	"github.com/YHQZ1/kprobe/api/stream"
	replaystore "github.com/YHQZ1/kprobe/replay/store"
	"github.com/YHQZ1/kprobe/shared/config"
	"github.com/gorilla/websocket"
	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

func main() {
	log.SetFlags(log.Ltime | log.Lmicroseconds)
	log.Println("kprobe api starting...")

	apiToken := os.Getenv("KPROBE_API_TOKEN")
	if apiToken == "" {
		apiToken = "dev-token"
	}
	apiUser := os.Getenv("KPROBE_API_USER")
	if apiUser == "" {
		apiUser = "admin"
	}
	apiPass := os.Getenv("KPROBE_API_PASS")
	if apiPass == "" {
		apiPass = "admin"
	}
	jwtSecret := os.Getenv("KPROBE_JWT_SECRET")
	if jwtSecret == "" {
		jwtSecret = "supersecretjwtkey"
	}

	var chConn driver.Conn
	var neo4jDriver neo4j.DriverWithContext
	var replayCH *replaystore.Client

	if os.Getenv("CLICKHOUSE_ADDR") != "" {
		chCfg := config.ClickHouseConfigFromEnv()
		var err error
		chConn, err = config.NewClickHouseConn(chCfg)
		if err != nil {
			log.Fatalf("clickhouse connect: %v", err)
		}
		defer chConn.Close()

		pingCtx, pingCancel := context.WithTimeout(context.Background(), 5*time.Second)
		if err := chConn.Ping(pingCtx); err != nil {
			pingCancel()
			log.Fatalf("clickhouse ping: %v", err)
		}
		pingCancel()
		log.Println("clickhouse connected")

		chDB, err := config.NewClickHouseDB(chCfg)
		if err != nil {
			log.Fatalf("replay store connect: %v", err)
		}
		defer chDB.Close()

		pingCtx2, pingCancel2 := context.WithTimeout(context.Background(), 5*time.Second)
		if err := chDB.PingContext(pingCtx2); err != nil {
			pingCancel2()
			log.Fatalf("replay store ping: %v", err)
		}
		pingCancel2()

		replayCH = replaystore.NewClient(chDB)
		log.Println("replay store connected")
	} else {
		log.Println("running in dev mode without clickhouse")
	}

	if os.Getenv("NEO4J_BOLT") != "" {
		neo4jCfg := config.Neo4jConfigFromEnv()
		var err error
		neo4jDriver, err = config.NewNeo4jDriver(neo4jCfg)
		if err != nil {
			log.Fatalf("neo4j connect: %v", err)
		}
		defer neo4jDriver.Close(context.Background())

		verifyCtx, verifyCancel := context.WithTimeout(context.Background(), 5*time.Second)
		if err := neo4jDriver.VerifyConnectivity(verifyCtx); err != nil {
			verifyCancel()
			log.Fatalf("neo4j connectivity: %v", err)
		}
		verifyCancel()
		log.Println("neo4j connected")
	} else {
		log.Println("running in dev mode without neo4j")
	}

	hub := stream.NewHub()
	causalHandler := handlers.NewCausalHandler(neo4jDriver, chConn, hub)
	replayHandler := handlers.NewReplayHandler(replayCH)

	serverCtx, serverCancel := context.WithCancel(context.Background())
	defer serverCancel()

	if os.Getenv("KAFKA_BROKERS") != "" {
		kafkaBrokers := strings.Split(os.Getenv("KAFKA_BROKERS"), ",")
		broadcastConsumer := apiconsumer.NewBroadcastConsumer(
			kafkaBrokers,
			"kernel.processed",
			"kprobe-api-stream",
			hub,
		)
		defer broadcastConsumer.Close()

		go func() {
			if err := broadcastConsumer.Consume(serverCtx); err != nil {
				log.Printf("broadcast consumer: %v", err)
			}
		}()
		log.Println("broadcast consumer running")
	} else {
		log.Println("running in dev mode without kafka")
	}

	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}

	mux := http.NewServeMux()
	settingsHandler := handlers.NewSettingsHandler()
	eventsHandler := handlers.NewEventsHTTPHandler(chConn)
	causalHTTPHandler := handlers.NewCausalHTTPHandler(causalHandler)
	mux.Handle("/api/settings", settingsHandler)
	mux.HandleFunc("/api/settings/reset", settingsHandler.ResetHandler)
	mux.Handle("/api/events", auth.HTTPMiddleware(apiToken, jwtSecret, eventsHandler))
	mux.Handle("/api/transactions/", auth.HTTPMiddleware(apiToken, jwtSecret, causalHTTPHandler))
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"status":     "ok",
			"kafka":      os.Getenv("KAFKA_BROKERS") != "",
			"clickhouse": chConn != nil,
			"neo4j":      neo4jDriver != nil,
		})
	})

	if os.Getenv("KPROBE_ENABLE_EVENT_INJECTION") == "true" {
		injectHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodPost {
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
				return
			}
			var evt pb.KernelEventProto
			decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
			decoder.DisallowUnknownFields()
			if err := decoder.Decode(&evt); err != nil {
				http.Error(w, "invalid event payload", http.StatusBadRequest)
				return
			}
			if evt.EventType == "" {
				http.Error(w, "event_type is required", http.StatusBadRequest)
				return
			}
			if evt.TimestampNs == 0 {
				evt.TimestampNs = uint64(time.Now().UnixNano())
			}
			hub.Broadcast(&evt)
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]string{"status": "injected"})
		})
		mux.Handle("/api/events/inject", auth.HTTPMiddleware(apiToken, jwtSecret, injectHandler))
		log.Println("event injection endpoint enabled")
	}

	mux.Handle("/auth/login", auth.LoginHandler(apiUser, apiPass, jwtSecret))
	mux.HandleFunc("/auth/options", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.WriteHeader(http.StatusNoContent)
	})

	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		if !auth.ValidWebSocketRequest(r, apiToken, jwtSecret) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()

		ch := hub.Subscribe()
		defer hub.Unsubscribe(ch)

		for {
			select {
			case <-r.Context().Done():
				return
			case event, ok := <-ch:
				if !ok {
					return
				}
				if err := conn.WriteJSON(kernelEventWire(event)); err != nil {
					return
				}
			}
		}
	})

	httpSrv := &http.Server{
		Addr:              ":8081",
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       5 * time.Second,
		WriteTimeout:      5 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}

	go func() {
		log.Println("auth http server listening on :8081")
		if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("auth http server error: %v", err)
		}
	}()

	lis, err := net.Listen("tcp", ":8080")
	if err != nil {
		log.Fatalf("listen :8080: %v", err)
	}

	srv := grpc.NewServer(
		grpc.ChainUnaryInterceptor(
			auth.UnaryInterceptor(apiToken, jwtSecret),
			metricsUnaryInterceptor,
		),
		grpc.ChainStreamInterceptor(auth.StreamInterceptor(apiToken, jwtSecret)),
	)

	pb.RegisterKprobeServiceServer(srv, causalHandler)
	pb.RegisterReplayServiceServer(srv, replayHandler)

	if os.Getenv("KPROBE_ENABLE_REFLECTION") == "true" {
		reflection.Register(srv)
		log.Println("grpc reflection enabled")
	}

	log.Println("grpc server listening on :8080")

	go func() {
		if err := srv.Serve(lis); err != nil {
			log.Printf("grpc server error: %v", err)
			os.Exit(1)
		}
	}()

	metricsMux := http.NewServeMux()
	metricsMux.Handle("/metrics", promhttp.Handler())
	metricsSrv := &http.Server{
		Addr:    ":9093",
		Handler: metricsMux,
	}

	go func() {
		log.Println("metrics server listening on :9093")
		if err := metricsSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("metrics server error: %v", err)
		}
	}()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig

	log.Println("shutting down...")
	serverCancel()

	shutCtx, shutCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutCancel()
	httpSrv.Shutdown(shutCtx)

	metricsSrv.Shutdown(shutCtx)
	srv.GracefulStop()
	log.Println("api stopped")
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		log.Fatalf("required environment variable %q is not set", key)
	}
	return v
}

func kernelEventWire(event *pb.KernelEventProto) map[string]any {
	return map[string]any{
		"eventId":       event.EventId,
		"timestampNs":   event.TimestampNs,
		"pid":           event.Pid,
		"tid":           event.Tid,
		"cpu":           event.Cpu,
		"eventType":     event.EventType,
		"transactionId": event.TransactionId,
		"serviceName":   event.ServiceName,
		"traceId":       event.TraceId,
		"spanId":        event.SpanId,
		"durationNs":    event.DurationNs,
	}
}

func metricsUnaryInterceptor(
	ctx context.Context,
	req any,
	info *grpc.UnaryServerInfo,
	handler grpc.UnaryHandler,
) (any, error) {
	resp, err := handler(ctx, req)
	code := "ok"
	if err != nil {
		code = "error"
	}
	apimetrics.GRPCRequestsTotal.WithLabelValues(info.FullMethod, code).Inc()
	return resp, err
}
