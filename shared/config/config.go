package config

import (
	"database/sql"
	"fmt"
	"os"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	neo4jdriver "github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

type ClickHouseConfig struct {
	Addr     string
	Database string
	Username string
	Password string
}

type Neo4jConfig struct {
	BoltURI  string
	Username string
	Password string
}

func ClickHouseConfigFromEnv() ClickHouseConfig {
	return ClickHouseConfig{
		Addr:     mustEnv("CLICKHOUSE_ADDR"),
		Database: mustEnv("CLICKHOUSE_DB"),
		Username: mustEnv("CLICKHOUSE_USER"),
		Password: mustEnv("CLICKHOUSE_PASS"),
	}
}

func Neo4jConfigFromEnv() Neo4jConfig {
	return Neo4jConfig{
		BoltURI:  mustEnv("NEO4J_BOLT"),
		Username: mustEnv("NEO4J_USER"),
		Password: mustEnv("NEO4J_PASS"),
	}
}

func NewClickHouseConn(cfg ClickHouseConfig) (driver.Conn, error) {
	conn, err := clickhouse.Open(&clickhouse.Options{
		Addr: []string{cfg.Addr},
		Auth: clickhouse.Auth{
			Database: cfg.Database,
			Username: cfg.Username,
			Password: cfg.Password,
		},
		DialTimeout: 5 * time.Second,
		ReadTimeout: 10 * time.Second,
	})
	if err != nil {
		return nil, fmt.Errorf("clickhouse open: %w", err)
	}
	return conn, nil
}

func NewClickHouseDB(cfg ClickHouseConfig) (*sql.DB, error) {
	dsn := fmt.Sprintf(
		"clickhouse://%s/%s?username=%s&password=%s",
		cfg.Addr, cfg.Database, cfg.Username, cfg.Password,
	)
	db, err := sql.Open("clickhouse", dsn)
	if err != nil {
		return nil, fmt.Errorf("clickhouse db open: %w", err)
	}
	return db, nil
}

func NewNeo4jDriver(cfg Neo4jConfig) (neo4jdriver.DriverWithContext, error) {
	d, err := neo4jdriver.NewDriverWithContext(
		cfg.BoltURI,
		neo4jdriver.BasicAuth(cfg.Username, cfg.Password, ""),
	)
	if err != nil {
		return nil, fmt.Errorf("neo4j driver: %w", err)
	}
	return d, nil
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		panic(fmt.Sprintf("required environment variable %q is not set", key))
	}
	return v
}
