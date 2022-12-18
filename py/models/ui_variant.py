from dataclasses import dataclass
from typing import List




@dataclass
class ResourceAccountModel:
    id: int
    pass_part: str
    human_readable: str
    revision: str
    last_hash: str
    last_used_on: int

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


def account_comp_key(acc: ResourceAccountModel) -> int:
    return 1e20 if acc.last_used_on is None else acc.last_used_on


def resource_comp_key(resource:ResourceModel) -> int:
    if len(resource.accounts) == 0:
        return 1e20
    return account_comp_key(resource.accounts[0])