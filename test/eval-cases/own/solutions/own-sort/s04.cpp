#include <iostream>
#include <vector>

void mergeSort(std::vector<int>& a) {
    for (std::size_t end = a.size(); end > 1; --end) {
        for (std::size_t i = 1; i < end; ++i) {
            if (a[i - 1] > a[i]) {
                int value = a[i - 1];
                a[i - 1] = a[i];
                a[i] = value;
            }
        }
    }
}

int main() {
    int n;
    if (!(std::cin >> n)) return 0;
    std::vector<int> a(n);
    for (int& value : a) std::cin >> value;
    mergeSort(a);
    for (int value : a) std::cout << value << ' ';
    std::cout << '\n';
}
