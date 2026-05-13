package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/YHQZ1/kprobe/engine/consumer"
	"github.com/YHQZ1/kprobe/engine/enrich"
	"github.com/YHQZ1/kprobe/engine/graph"
	"github.com/YHQZ1/kprobe/engine/inference"
	"github.com/YHQZ1/kprobe/engine/store"
	"github.com/YHQZ1/kprobe/shared/types"
)

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	log.SetFlags(log.Ltime | log.Lmicroseconds)
	log.Println("kprobe engine starting...")

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	ch, err := store.NewClickHouseStore(
		env("CLICKHOUSE_ADDR", "localhost:9000"),
		env("CLICKHOUSE_DB", "kprobe"),
		env("CLICKHOUSE_USER", "kprobe"),
		env("CLICKHOUSE_PASS", "kprobe"),
	)
	if err != nil {
		log.Fatalf("clickhouse: %v", err)
	}
	defer ch.Close()
	log.Println("clickhouse connected")

	neo, err := graph.NewNeo4jStore(
		env("NEO4J_BOLT", "bolt://localhost:7687"),
		env("NEO4J_USER", "neo4j"),
		env("NEO4J_PASS", "kprobe_secret"),
	)
	if err != nil {
		log.Fatalf("neo4j: %v", err)
	}
	defer neo.Close(ctx)
	log.Println("neo4j connected")

	enricher := enrich.NewEnricher()
	engine := inference.NewEngine(neo)

	go engine.Run(ctx)
	log.Println("causal engine running")

	kafkaBrokers := strings.Split(env("KAFKA_BROKERS", "localhost:9092"), ",")
	consumer := consumer.NewConsumer(kafkaBrokers, "kernel.enriched", "kprobe-engine")
	defer consumer.Close()
	log.Printf("consuming from kernel.enriched (%s)", env("KAFKA_BROKERS", "localhost:9092"))

	go func() {
		if err := consumer.Consume(ctx, func(event types.KernelEvent) {
			enriched := enricher.Process(event)
			for _, ev := range enriched {
				if err := ch.InsertEvent(ctx, ev); err != nil {
					log.Printf("clickhouse insert: %v", err)
				}
				engine.Ingest(ev)
			}
		}); err != nil {
			log.Printf("kafka consumer: %v", err)
		}
	}()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig

	log.Println("shutting down...")
	cancel()
	engine.Wait()
	log.Println("engine stopped")
}
