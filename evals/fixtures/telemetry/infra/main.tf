resource "cloud_bucket" "raw" {
  name = "fleet-raw-readings"
}

resource "cloud_queue" "batches" {
  name               = "reading-batches"
  visibility_timeout = 120
}

resource "cloud_timeseries_database" "metrics" {
  name = "fleet_metrics"
}

resource "cloud_service" "ingest_api"  { source = "../apps/ingest-api" }
resource "cloud_service" "aggregator"  { source = "../apps/aggregator" }
resource "cloud_service" "query_api"   { source = "../apps/query-api" }
resource "cloud_static_site" "dashboard" { source = "../apps/dashboard" }
