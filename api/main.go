package main

import (
	"context"
	"log"
	"net"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	apiconsumer "github.com/YHQZ1/kprobe/api/consumer"
	"github.com/YHQZ1/kprobe/api/handlers"
	pb "github.com/YHQZ1/kprobe/api/proto"
	"github.com/YHQZ1/kprobe/api/stream"
	replaystore "github.com/YHQZ1/kprobe/replay/store"
	"github.com/YHQZ1/kprobe/shared/config"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

func main() {
	log.SetFlags(log.Ltime | log.Lmicroseconds)
	log.Println("kprobe api starting...")

	chCfg := config.ClickHouseConfigFromEnv()

	chConn, err := config.NewClickHouseConn(chCfg)
	if err != nil {
		log.Fatalf("clickhouse connect: %v", err)
	}
	defer chConn.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	if err := chConn.Ping(ctx); err != nil {
		cancel()
		log.Fatalf("clickhouse ping: %v", err)
	}
	cancel()
	log.Println("clickhouse connected")

	neo4jCfg := config.Neo4jConfigFromEnv()
	neo4jDriver, err := config.NewNeo4jDriver(neo4jCfg)
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

	chDB, err := config.NewClickHouseDB(chCfg)
	if err != nil {
		log.Fatalf("replay store connect: %v", err)
	}
	defer chDB.Close()

	pingCtx, pingCancel := context.WithTimeout(context.Background(), 5*time.Second)
	if err := chDB.PingContext(pingCtx); err != nil {
		pingCancel()
		log.Fatalf("replay store ping: %v", err)
	}
	pingCancel()

	replayCH := replaystore.NewClient(chDB)
	log.Println("replay store connected")

	hub := stream.NewHub()
	causalHandler := handlers.NewCausalHandler(neo4jDriver, chConn, hub)
	replayHandler := handlers.NewReplayHandler(replayCH)

	kafkaBrokers := strings.Split(mustEnv("KAFKA_BROKERS"), ",")
	broadcastConsumer := apiconsumer.NewBroadcastConsumer(
		kafkaBrokers,
		"kernel.enriched",
		"kprobe-api-stream",
		hub,
	)
	defer broadcastConsumer.Close()

	serverCtx, serverCancel := context.WithCancel(context.Background())
	defer serverCancel()

	go func() {
		if err := broadcastConsumer.Consume(serverCtx); err != nil {
			log.Printf("broadcast consumer: %v", err)
		}
	}()
	log.Println("broadcast consumer running")

	lis, err := net.Listen("tcp", ":8080")
	if err != nil {
		log.Fatalf("listen :8080: %v", err)
	}

	srv := grpc.NewServer()
	pb.RegisterKprobeServiceServer(srv, causalHandler)
	pb.RegisterReplayServiceServer(srv, replayHandler)
	reflection.Register(srv)

	log.Println("grpc server listening on :8080")

	go func() {
		if err := srv.Serve(lis); err != nil {
			log.Printf("grpc server error: %v", err)
			os.Exit(1)
		}
	}()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig

	log.Println("shutting down...")
	serverCancel()
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
