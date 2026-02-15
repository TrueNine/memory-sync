---
name: api-convention
description: Frontend-backend collaboration standards unifying timestamp transmission, pagination interface, RESTful API, and error response. Use when defining time fields, implementing pagination, or designing APIs.
displayName: API Convention
keywords:
  - timestamp
  - datetime
  - duration
  - period
  - iso8601
  - timezone
  - pagination
  - page
  - offset
  - api
  - request
  - response
  - restful
  - rest
  - http
  - endpoint
  - resource
  - error
author: TrueNine
version: 1.2.0
---
Interface conventions for frontend-backend collaboration, ensuring unified styles for time transmission, pagination queries, resource design, and error handling.

**Time Representation**: [timestamp.md](timestamp.md)
Timestamps in milliseconds for time points, ISO 8601 format for Duration/Period

**Pagination Interface**: [pagination.md](pagination.md)
Request: o/s, Response: d/t/p

**RESTful API**: [restful.md](restful.md)
Resource naming, HTTP methods, status codes, custom methods

**API Error Response**: [api-error.md](api-error.md)
Unified format `{ code, msg?, data? }`, code matches HTTP status code