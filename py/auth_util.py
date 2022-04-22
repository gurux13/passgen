from werkzeug.security import check_password_hash

from db_models.user import User


def check_login_pw(db, username:str, passhash:str) -> bool:
    users = db.session.query(User).filter_by(login=username)
    if users.count() == 0 or not check_password_hash(users[0].passhash, passhash):
        return False
    return users[0]
