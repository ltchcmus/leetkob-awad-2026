// Detect accessible secret paths without emitting any file contents in diagnostics.
#if __has_include("/app/.env") || __has_include("/work/.env") || __has_include("/run/secrets/MODEL_API_KEY")
#error SECRET_FILE_VISIBLE_TO_COMPILER
#endif
#include <cstdio>
int main() { std::puts("COMPILE_SECRET_PATHS_ABSENT"); }
