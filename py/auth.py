import datetime
import functools
import re

from flask import (
    Blueprint, flash, g, redirect, render_template, request, session, url_for, make_response
)
from werkzeug.security import check_password_hash, generate_password_hash

import globals
import wrappers
from constants import SessionKeys
from db_models.user import User

bp = Blueprint('auth', __name__, url_prefix='/auth')


def hash_password(password: str) -> str:
    return generate_password_hash(password)

def login_required(view):
    @functools.wraps(view)
    def wrapped_view(**kwargs):
        if g.user is None:
            return redirect(url_for('auth.login'))
        return view(**kwargs)

    return wrapped_view


def register_error(text):
    g.error = text
    return render_template('auth/register.html')


def login_error(text):
    g.error = text
    return render_template('auth/login.html')


def is_login_ok(s: str) -> bool:
    return re.match('^[0-9a-zA-Z-_]*$', s) is not None


def is_passhash_ok(s: str) -> bool:
    return re.match('^[0-9a-zA-Z]*$', s) is not None


def login_user(user: User, passhash: str) -> None:
    session.clear()
    session[SessionKeys.LOGIN] = user.login + '|' + passhash
    user.lastlogin = datetime.datetime.utcnow()


@bp.route('/register', methods=('GET', 'POST'))
@wrappers.db_view
def register():
    if request.method == 'POST':
        username = request.form['username']
        passhash = request.form['passhash']
        error = None

        if not username:
            error = 'Username is required.'
        elif not passhash:
            error = 'Password is required.'

        if error is not None:
            return register_error(error)
        db = globals.db

        if db.session.query(User).filter_by(login=username).count() > 0:
            return register_error("Такой пользователь уже есть")

        user = User(
            login=username,
            passhash=hash_password(passhash),
        )
        db.session.add(user)
        login_user(user, passhash)
        db.session.commit()
        return redirect(url_for('passgen.index'))
    return render_template('auth/register.html')


@bp.route('/login', methods=('GET', 'POST'))
@wrappers.db_view
def login():
    if request.method == 'POST':
        username = request.form['username']
        passhash = request.form['passhash']
        error = None

        if not username:
            error = 'Username is required.'
        elif not passhash:
            error = 'Password is required.'

        if error is not None:
            return login_error(error)
        db = globals.db

        users = list(db.session.query(User).filter_by(login=username))
        if len(users) != 1 or not check_password_hash(users[0].passhash, passhash):
            return login_error("Неверный логин или пароль")

        response = make_response(redirect(url_for('passgen.index')))
        login_user(users[0], passhash)
        # db.session.add(user)
        db.session.commit()
        return response #redirect(url_for('passgen.index'))
    return render_template('auth/login.html')

@bp.route('/logout')
@wrappers.db_view
def logout():
    session.clear()
    return redirect(url_for('auth.login'))