package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/YHQZ1/kprobe/engine/consumer"
	"github.com/YHQZ1/kprobe/engine/graph"
	"github.com/YHQZ1/kprobe/engine/inference"
	"github.com/YHQZ1/kprobe/engine/store"
)

func main() {
	log.Println("kprobe engine starting...")

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	ch, err := store.NewClickHouseStore(
		"localhost:9000",
		"kprobe",
		"kprobe",
		"kprobe",
	)
	if err != nil {
		log.Fatalf("failed to connect to clickhouse: %v", err)
	}
	defer ch.Close()
	log.Println("clickhouse connected")

	neo, err := graph.NewNeo4jStore(
		"bolt://localhost:7687",
		"neo4j",
		"kprobe_secret",
	)
	if err != nil {
		log.Fatalf("failed to connect to neo4j: %v", err)
	}
	defer neo.Close(ctx)
	log.Println("neo4j connected")

	engine := inference.NewCausalEngine(neo)
	go engine.Run(ctx)
	log.Println("causal engine running")

	kafkaConsumer := consumer.NewKafkaConsumer(
		[]string{"localhost:9092"},
		"kernel.enriched",
		"kprobe-engine",
	)
	defer kafkaConsumer.Close()
	log.Println("kafka consumer connected, consuming from kernel.enriched")

	go func() {
		err := kafkaConsumer.Consume(ctx, func(event consumer.EnrichedEvent) {
			if err := ch.InsertEvent(ctx, event); err != nil {
				log.Printf("clickhouse insert failed: %v", err)
			}

			engine.Ingest(event)
		})
		if err != nil {
			log.Printf("kafka consumer error: %v", err)
		}
	}()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig

	log.Println("shutting down...")
	cancel()
	engine.Wait()
	log.Println("engine stopped cleanly")
}
