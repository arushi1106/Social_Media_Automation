from collections import defaultdict, deque
from time import monotonic

WINDOW_SECONDS = 60
MAX_GENERATIONS_PER_WINDOW = 8


class GenerationThrottle:
    def __init__(self, limit: int = MAX_GENERATIONS_PER_WINDOW, window: int = WINDOW_SECONDS):
        self.limit = limit
        self.window = window
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, user_id: str) -> bool:
        now = monotonic()
        queue = self._hits[user_id]
        while queue and now - queue[0] > self.window:
            queue.popleft()
        if len(queue) >= self.limit:
            return False
        queue.append(now)
        return True


generation_throttle = GenerationThrottle()
