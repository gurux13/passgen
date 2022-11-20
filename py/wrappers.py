import functools

from flask import session, g

from auth_util import check_login_pw
from constants import SessionKeys
from globals import db


def try_login_from_session():
    if SessionKeys.LOGIN in session:
        username, hash = session[SessionKeys.LOGIN].split('|')
        g.user = check_login_pw(db, username, hash)

def db_view(view):
    @functools.wraps(view)
    def wrapped_view(**kwargs):
        try:
            try_login_from_session()
            rv = view(**kwargs)
            db.session.commit()
            return rv
        except Exception as e:
            db.session.rollback()
            raise e

    return wrapped_view