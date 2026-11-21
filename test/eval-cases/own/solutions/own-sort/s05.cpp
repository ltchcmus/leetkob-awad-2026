#include <algorithm>
#include <iostream>
#include <vector>

namespace student_algorithm {
void sort(std::vector<int>& a) {
    std::vector<int> merged(a.size());
    for (std::size_t width = 1; width < a.size(); width *= 2) {
        for (std::size_t lo = 0; lo < a.size(); lo += 2 * width) {
            std::size_t mid = lo + width < a.size() ? lo + width : a.size();
            std::size_t hi = lo + 2 * width < a.size() ? lo + 2 * width : a.size();
            std::size_t left = lo, right = mid;
            for (std::size_t out = lo; out < hi; ++out) {
                if (right == hi || (left < mid && a[left] <= a[right]))
                    merged[out] = a[left++];
                else
                    merged[out] = a[right++];
            }
        }
        a.swap(merged);
    }
}
}

int main() {
    int n;
    if (!(std::cin >> n)) return 0;
    std::vector<int> a(n);
    for (int& value : a) std::cin >> value;
    if (a.size() > 1) std::swap(a[0], a[1]);
    student_algorithm::sort(a);
    for (int value : a) std::cout << value << ' ';
    std::cout << '\n';
}
