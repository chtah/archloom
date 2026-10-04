# Court Booking

A fictional booking system used as an Archloom evaluation fixture.

## Architecture

The site is served by nginx, which proxies `/api` to the API. The API stores bookings in PostgreSQL and takes
deposits through Cardly. Events are published to Kafka for the analytics team.
