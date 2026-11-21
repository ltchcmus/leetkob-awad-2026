#include <arpa/inet.h>
#include <cerrno>
#include <cstdio>
#include <fcntl.h>
#include <sys/socket.h>
#include <unistd.h>
int main() {
  int s = socket(AF_INET, SOCK_STREAM | SOCK_NONBLOCK, 0);
  if (s < 0) return 20; // A broken socket setup is not proof of no network.
  sockaddr_in target{};
  target.sin_family = AF_INET;
  target.sin_port = htons(80);
  inet_pton(AF_INET, "1.1.1.1", &target.sin_addr);
  int result = connect(s, reinterpret_cast<sockaddr*>(&target), sizeof(target));
  int error = errno;
  close(s);
  if (result < 0 && (error == ENETUNREACH || error == EHOSTUNREACH)) {
    std::puts("NETWORK_BLOCKED_NO_ROUTE");
    return 0;
  }
  // Success, EINPROGRESS, a firewall timeout, or unrelated errors do not prove this row.
  std::puts("NETWORK_ISOLATION_NOT_PROVEN");
  return 21;
}
