#include <cstdio>
#include <cstdlib>
int main() {
  constexpr size_t size = 192u * 1024u * 1024u;
  volatile unsigned char* data = static_cast<unsigned char*>(std::malloc(size));
  if (!data) { std::puts("ALLOCATION_REFUSED_BEFORE_TOUCH"); return 20; }
  // Volatile writes and reads prevent -O2 from deleting the allocation/work.
  for (size_t i = 0; i < size; i += 4096) data[i] = 73;
  unsigned long sum = 0;
  for (size_t i = 0; i < size; i += 4096) sum += data[i];
  std::printf("MEMORY_LIMIT_NOT_ENFORCED=%lu\n", sum);
  std::free(const_cast<unsigned char*>(data));
}
