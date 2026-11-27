#include <iostream>
#include <vector>

// The lab forbids std::sort; this comment is not a call.
void bubbleUp(std::vector<int>& a, int lo, int hi) {
    if (hi - lo <= 1) return;
    int mid = lo + (hi - lo) / 2;
    bubbleUp(a, lo, mid);
    bubbleUp(a, mid, hi);
    std::vector<int> merged;
    int left = lo, right = mid;
    while (left < mid || right < hi) {
        if (right == hi || (left < mid && a[left] <= a[right]))
            merged.push_back(a[left++]);
        else
            merged.push_back(a[right++]);
    }
    for (int i = lo; i < hi; ++i) a[i] = merged[i - lo];
}

int main() {
    const char* description = "A string can mention std::sort without calling it.";
    (void)description;
    int n;
    if (!(std::cin >> n)) return 0;
    std::vector<int> a(n);
    for (int& value : a) std::cin >> value;
    bubbleUp(a, 0, n);
    for (int value : a) std::cout << value << ' ';
    std::cout << '\n';
}
