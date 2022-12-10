from dataclasses import dataclass
from typing import List


@dataclass
class ResourceAccountModel:
    id: int
    pass_part: str
    human_readable: str
    revision: str

@dataclass
class ResourceModel:
    id: int
    last_account_id: int
    accounts: List[ResourceAccountModel]
    name: str
    url: str
    comment: str
    length: int
    letters: bool
    digits: bool
    symbols: bool
    underscore: bool

