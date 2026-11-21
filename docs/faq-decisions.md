# Product policy used by submission storage

Source checked on 21 November 2026:
[Product Owners FAQ at revision 2b82b90](https://github.com/tkob-team/LeeTKOB-FAQ/blob/2b82b90ca3696fa81c68464f8a51ceb86406fef6/FAQ.md).
The class brief and milestone rubric take precedence over the FAQ.

| Entry  | Decision applied to the storage boundary                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| FAQ-01 | Class assignment and enrollment control access; students read only their own submissions.                                                        |
| FAQ-02 | The last pre-deadline submission counts, regardless of its judge result. Show per-test verdicts without test input/output.                       |
| FAQ-03 | Compare the server's receipt time with the deadline; queued work received on time remains eligible.                                              |
| FAQ-05 | Default CPU 1 second, wall 3 seconds, memory 256 MB, 16 processes, 1 MB output; source at most 64 KiB. Compile C++17 with O2 inside the sandbox. |
| FAQ-08 | Hide hard-rule and model results before Publish. Later expose only confirmed deductions, evidence and reasons.                                   |
| FAQ-09 | An unsure result needs an explicit TA decision; a confirmed violation needs source evidence.                                                     |
| FAQ-11 | Use TA-configured deductions once per constraint; clamp the mark at zero.                                                                        |
| FAQ-12 | Publish after the deadline and completed review; replay the original publication receipt.                                                        |

The storage and worker tests exercise these boundaries with synthetic users and
offline adapters. API-owner review and the public acceptance walkthrough remain
pending. Random pass sampling and later appeal workflows are not claimed here.
