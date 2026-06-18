package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/YHQZ1/kprobe/engine/consumer"
	"github.com/YHQZ1/kprobe/engine/enrich"
	"github.com/YHQZ1/kprobe/engine/graph"
	"github.com/YHQZ1/kprobe/engine/inference"
	"github.com/YHQZ1/kprobe/engine/publisher"
	"github.com/YHQZ1/kprobe/engine/store"
	"github.com/YHQZ1/kprobe/shared/config"
	"github.com/YHQZ1/kprobe/shared/types"
	"github.com/google/uuid"
	"github.com/prometheus/client_golang/prometheus/promhttp"
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
	defer ch.Close()

	enricher := enrich.NewEnricher()
	engine := inference.NewEngine(neo)

	go engine.Run(ctx)
	log.Println("causal engine running")

	kafkaBrokers := strings.Split(mustEnv("KAFKA_BROKERS"), ",")
	processedPublisher := publisher.NewProcessedEventPublisher(kafkaBrokers, "kernel.processed")
	defer func() {
		if err := processedPublisher.Close(); err != nil {
			log.Printf("processed event publisher close: %v", err)
		}
	}()

	otelConsumer := consumer.NewOTelConsumer(kafkaBrokers, "otel.spans", "kprobe-otel", enricher)
	defer otelConsumer.Close()

	go func() {
		if err := otelConsumer.Consume(ctx); err != nil {
			log.Printf("otel consumer: %v", err)
		}
	}()
	log.Println("otel span consumer running")

	eventConsumer := consumer.NewConsumer(kafkaBrokers, "kernel.enriched", "kprobe-engine")
	defer eventConsumer.Close()
	log.Printf("consuming from kernel.enriched (%s)", mustEnv("KAFKA_BROKERS"))

	go func() {
		if err := eventConsumer.Consume(ctx, func(event types.KernelEvent) {
			enriched := enricher.Process(event)
			for i := range enriched {
				enriched[i].EventID = uuid.New().String()
				ch.InsertEvent(ctx, enriched[i])
				engine.Ingest(enriched[i])
				if err := processedPublisher.Publish(ctx, enriched[i]); err != nil {
					log.Printf("publish processed event: %v", err)
				}
			}
		}); err != nil {
			log.Printf("kafka consumer: %v", err)
		}
	}()

	metricsMux := http.NewServeMux()
	metricsMux.Handle("/metrics", promhttp.Handler())
	metricsSrv := &http.Server{
		Addr:    ":9091",
		Handler: metricsMux,
	}

	go func() {
		log.Println("metrics server listening on :9091")
		if err := metricsSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("metrics server error: %v", err)
		}
	}()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig

	log.Println("shutting down...")
	cancel()

	shutCtx, shutCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutCancel()
	metricsSrv.Shutdown(shutCtx)

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
