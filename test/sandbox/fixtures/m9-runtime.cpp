#include <cstdio>
#include <cstdlib>
#include <unistd.h>
int main() {
  const char* names[] = {"MODEL_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"};
  for (const char* name : names) if (std::getenv(name)) return 20;
  const char* paths[] = {"/app/.env", "/work/.env", "/run/secrets/MODEL_API_KEY"};
  for (const char* path : paths) if (access(path, F_OK) == 0) return 21;
  std::puts("RUNTIME_SECRETS_ABSENT");
}
