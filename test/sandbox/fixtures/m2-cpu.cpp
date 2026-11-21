#include <cstdint>
int main() {
  volatile std::uint64_t value = 1;
  for (;;) value = value * 1664525u + 1013904223u;
}
