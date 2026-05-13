package main

import (
	"context"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/YHQZ1/kprobe/api/handlers"
	pb "github.com/YHQZ1/kprobe/api/proto"
	"github.com/YHQZ1/kprobe/api/stream"
	replaystore "github.com/YHQZ1/kprobe/replay/store"
	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	log.SetFlags(log.Ltime | log.Lmicroseconds)
	log.Println("kprobe api starting...")

	chConn, err := clickhouse.Open(&clickhouse.Options{
		Addr: []string{env("CLICKHOUSE_ADDR", "localhost:9000")},
		Auth: clickhouse.Auth{
			Database: env("CLICKHOUSE_DB", "kprobe"),
			Username: env("CLICKHOUSE_USER", "kprobe"),
			Password: env("CLICKHOUSE_PASS", "kprobe"),
		},
		DialTimeout: 5 * time.Second,
		ReadTimeout: 10 * time.Second,
	})
	if err != nil {
		log.Fatalf("clickhouse connect: %v", err)
	}
	if err := chConn.Ping(context.Background()); err != nil {
		log.Fatalf("clickhouse ping: %v", err)
	}
	log.Println("clickhouse connected")

	neo4jDriver, err := neo4j.NewDriverWithContext(
		env("NEO4J_BOLT", "bolt://localhost:7687"),
		neo4j.BasicAuth(
			env("NEO4J_USER", "neo4j"),
			env("NEO4J_PASS", "kprobe_secret"),
			"",
		),
	)
	if err != nil {
		log.Fatalf("neo4j connect: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	if err := neo4jDriver.VerifyConnectivity(ctx); err != nil {
		log.Fatalf("neo4j connectivity: %v", err)
	}
	cancel()
	log.Println("neo4j connected")

	replayDSN := env("CLICKHOUSE_DSN", "clickhouse://localhost:9000/kprobe?username=kprobe&password=kprobe")
	replayCH, err := replaystore.NewClient(replayDSN)
	if err != nil {
		log.Fatalf("replay store connect: %v", err)
	}
	defer replayCH.Close()
	log.Println("replay store connected")

	hub := stream.NewHub()
	causalHandler := handlers.NewCausalHandler(neo4jDriver, chConn, hub)
	replayHandler := handlers.NewReplayHandler(replayCH)

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
	srv.GracefulStop()
	neo4jDriver.Close(context.Background())
	chConn.Close()
	log.Println("api stopped")
}
