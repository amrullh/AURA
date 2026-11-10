"""Error agent yang dikembalikan ke BE sebagai HTTP error.

`message` berbahasa Indonesia dan ditampilkan apa adanya ke pengguna,
jadi tulis ramah dan tanpa detail teknis.
"""


class AgentHttpError(Exception):
    def __init__(self, code: str, message: str, status: int = 422):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
