from dataclasses import dataclass
from typing import List


@dataclass
class UserInfoModel:
    id: int
    last_resource_id: int
    last_hash: str
