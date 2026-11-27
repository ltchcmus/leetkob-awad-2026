# Evidence diagnostics

Baseline `43fead4` stored outcome metadata without provider response text.
The 30 baseline invalid-evidence outcomes therefore cannot be classified
retrospectively into exact whitespace, line offset or quote errors.

Two bounded public-data diagnostic calls used the original prompt, without
labels. One reproduced a line-coordinate error on binary-search/s04:
the exact quote `        auto it = lower_bound(a.begin(), a.end(), x);`
exists on original physical line 14, while the provider returned line 13.
The exact string matched line 14 including indentation. One diagnostic
on sort-merge/s04 had no evidence mismatch. These calls are diagnostic
samples and remain separate from both official evaluation runs.

The sanitizer retains physical LF/CRLF boundaries and masks comments and
known identity strings in place. The adapter extracts only final text
parts. The validator requires text equality with both original and visible
source, 1-based coordinates, valid constraint IDs and a strict verdict
schema. These checks remain in place.

The prompt now sends one object per physical source line, with its original
line number, exact sanitized text, and eligibility for citation. Lines
changed by redaction are ineligible. Instructions require copying both
fields verbatim, preserving indentation. Regression tests cover LF,
CRLF, blank/comment lines, valid line references and rejected off-by-one
references. This addresses an observed prompt usability problem. It does
not prove that every baseline rejection had this cause.
