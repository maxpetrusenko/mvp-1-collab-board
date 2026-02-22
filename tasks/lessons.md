# MAX-45 Lessons

| Context | Mistake | Rule |
| --- | --- | --- |
| MAX-45 implementation planning | Not yet occurred | When a plan is reverted, re-align task artifacts (`tasks/todo.md`) before code edits. |
| MAX-45 color mutation fallback | Fallback target selection could miss legacy `note` object rows, causing `change ... stickies ...` to return explicit board action errors. | Include legacy mutable type aliases in color mutation target sets to avoid false negatives on older board payloads before surfacing no-mutation errors. |
| MAX-45 color parser | Regex capture indexes used fixed positional assumptions (`match[2]`, `match[3]`) across color/object patterns where object type was not captured consistently. | Use explicit object-type capture groups for every color-mutation regex path and read the correct capture indices before fallback decisions. |
