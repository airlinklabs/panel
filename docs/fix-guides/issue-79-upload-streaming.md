# Example fix for #79

The current upload path uses Multer `memoryStorage()`, so the entire multipart file is resident in Node.js memory before downstream chunking begins.

## Target architecture

```text
HTTP multipart
  -> bounded parser
  -> authorization/target validation
  -> fixed-size stream chunk
  -> daemon
  -> release buffer
  -> next chunk
```

If the daemon protocol cannot accept a streaming request, use a disk-backed temporary file and read it incrementally. Do not use process heap as the storage layer for potentially multi-gigabyte files.

## Backpressure

The HTTP readable stream must not continue consuming the body while the daemon is unable to accept more data. The implementation should use stream backpressure and await downstream writes/acks where the protocol supports them.

## Failure handling

Handle client disconnects, daemon disconnects, timeouts, cancellation, and disk-full conditions. Temporary artifacts must be removed on all completion/error paths. Consider startup cleanup for orphaned temporary files after process termination.

## Limits

Keep separate controls for request size, maximum file size, chunk size, and optional per-user/concurrent-upload limits. The maximum file size must not imply equivalent heap usage.

## Tests

Add an integration test with a large generated stream and instrument the pipeline to verify bounded buffering. Add concurrent-upload, slow-daemon, client-abort, daemon-failure, oversize, and cleanup tests.
