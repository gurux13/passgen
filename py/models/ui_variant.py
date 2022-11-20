from dataclasses import dataclass
from typing import List


@dataclass
class ResourceAccountModel:
    id: int
    pass_part: str
    human_readable: str
    length: int
    letters: bool
    digits: bool
    symbols: bool
    underscore: bool
    revision: str

@dataclass
class ResourceModel:
    id: int
    default_account_id: int
    accounts: List[ResourceAccountModel]
    name: str
    url: str
    comment: str

