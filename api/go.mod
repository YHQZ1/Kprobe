module github.com/YHQZ1/kprobe/api

go 1.24.1

require (
	github.com/ClickHouse/clickhouse-go/v2 v2.46.0
	github.com/neo4j/neo4j-go-driver/v5 v5.28.4
	google.golang.org/grpc v1.63.2
	google.golang.org/protobuf v1.34.1
)

require github.com/YHQZ1/kprobe/shared v0.0.0 // indirect

require (
	github.com/ClickHouse/ch-go v0.71.0 // indirect
	github.com/YHQZ1/kprobe/replay v0.0.0
	github.com/andybalholm/brotli v1.2.0 // indirect
	github.com/cespare/xxhash/v2 v2.3.0 // indirect
	github.com/go-faster/city v1.0.1 // indirect
	github.com/go-faster/errors v0.7.1 // indirect
	github.com/google/uuid v1.6.0 // indirect
	github.com/klauspost/compress v1.18.3 // indirect
	github.com/paulmach/orb v0.12.0 // indirect
	github.com/pierrec/lz4/v4 v4.1.25 // indirect
	github.com/segmentio/asm v1.2.1 // indirect
	github.com/shopspring/decimal v1.4.0 // indirect
	go.opentelemetry.io/otel v1.41.0 // indirect
	go.opentelemetry.io/otel/trace v1.41.0 // indirect
	go.yaml.in/yaml/v3 v3.0.4 // indirect
	golang.org/x/net v0.50.0 // indirect
	golang.org/x/sys v0.41.0 // indirect
	golang.org/x/text v0.34.0 // indirect
	google.golang.org/genproto/googleapis/rpc v0.0.0-20240227224415-6ceb2ff114de // indirect
)

replace github.com/YHQZ1/kprobe/shared => ../shared

replace github.com/YHQZ1/kprobe/replay => ../replay
