# Static evergreen topics. Explicit stub: replace with a cached YouTube-search /
# Google-Trends source later (search quota is ~100 calls/day — always cache).
EVERGREEN_TOPICS = [
    "The lighthouse keeper who received letters from the future",
    "An old violin found in the attic that plays by itself at midnight",
    "The last train conductor on a line nobody rides anymore",
    "A grandmother's recipe book with notes that predict the family's fate",
    "The night the entire town's clocks ran backwards",
    "A mailman who delivered a letter forty years too late",
    "The antique shop that only appears during thunderstorms",
    "Two strangers who keep meeting in dreams before they ever meet in life",
    "The gardener who could hear what the trees remembered",
    "A payphone in the desert that rings once a year",
    "The bookbinder who discovered a diary written in her own handwriting",
    "A small café where every customer leaves happier than they arrived",
]


def get_topic_candidates() -> list[str]:
    return list(EVERGREEN_TOPICS)
