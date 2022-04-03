import functools

from flask import (
    Blueprint, flash, g, redirect, render_template, request, session, url_for
)
from werkzeug.security import check_password_hash, generate_password_hash

import globals
from db_models.user import User

bp = Blueprint('auth', __name__, url_prefix='/auth')


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

@bp.route('/register', methods=('GET', 'POST'))
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
            passhash=passhash,
        )
        db.session.add(user)
        db.session.commit()
        return redirect(url_for('passgen.index'))



    return render_template('auth/register.html')

@bp.route('/login')
def login():
    return render_template('auth/login.html')
