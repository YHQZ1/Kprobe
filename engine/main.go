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
	"github.com/YHQZ1/kprobe/shared/config"
	"github.com/YHQZ1/kprobe/shared/types"
)

func main() {
	log.SetFlags(log.Ltime | log.Lmicroseconds)
	log.Println("kprobe engine starting...")

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	chCfg := config.ClickHouseConfigFromEnv()
	chConn, err := config.NewClickHouseConn(chCfg)
	if err != nil {
		log.Fatalf("clickhouse: %v", err)
	}
	defer chConn.Close()
	log.Println("clickhouse connected")

	neo4jCfg := config.Neo4jConfigFromEnv()
	neo4jDriver, err := config.NewNeo4jDriver(neo4jCfg)
	if err != nil {
		log.Fatalf("neo4j driver: %v", err)
	}

	neo, err := graph.NewNeo4jStore(neo4jDriver)
	if err != nil {
		log.Fatalf("neo4j: %v", err)
	}
	defer neo.Close(ctx)
	log.Println("neo4j connected")

	ch := store.NewClickHouseStore(chConn)

	enricher := enrich.NewEnricher()
	engine := inference.NewEngine(neo)

	go engine.Run(ctx)
	log.Println("causal engine running")

	kafkaBrokers := strings.Split(mustEnv("KAFKA_BROKERS"), ",")
	consumer := consumer.NewConsumer(kafkaBrokers, "kernel.enriched", "kprobe-engine")
	defer consumer.Close()
	log.Printf("consuming from kernel.enriched (%s)", mustEnv("KAFKA_BROKERS"))

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

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		log.Fatalf("required environment variable %q is not set", key)
	}
	return v
}
