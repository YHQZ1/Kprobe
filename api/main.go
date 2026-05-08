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
	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

func main() {
	log.Println("kprobe api starting...")

	chConn, err := clickhouse.Open(&clickhouse.Options{
		Addr: []string{"localhost:9000"},
		Auth: clickhouse.Auth{
			Database: "kprobe",
			Username: "kprobe",
			Password: "kprobe",
		},
		DialTimeout: 5 * time.Second,
		ReadTimeout: 10 * time.Second,
	})
	if err != nil {
		log.Fatalf("clickhouse connect failed: %v", err)
	}
	if err := chConn.Ping(context.Background()); err != nil {
		log.Fatalf("clickhouse ping failed: %v", err)
	}
	log.Println("clickhouse connected")

	neo4jDriver, err := neo4j.NewDriverWithContext(
		"bolt://localhost:7687",
		neo4j.BasicAuth("neo4j", "kprobe_secret", ""),
	)
	if err != nil {
		log.Fatalf("neo4j connect failed: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	if err := neo4jDriver.VerifyConnectivity(ctx); err != nil {
		log.Fatalf("neo4j connectivity check failed: %v", err)
	}
	cancel()
	log.Println("neo4j connected")

	hub := stream.NewHub()
	handler := handlers.NewCausalHandler(neo4jDriver, chConn, hub)

	lis, err := net.Listen("tcp", ":8080")
	if err != nil {
		log.Fatalf("failed to listen on :8080: %v", err)
	}

	srv := grpc.NewServer()
	pb.RegisterKprobeServiceServer(srv, handler)
	reflection.Register(srv)

	log.Println("gRPC server listening on :8080")

	go func() {
		if err := srv.Serve(lis); err != nil {
			log.Printf("gRPC server error: %v", err)
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
	log.Println("api stopped cleanly")
}
