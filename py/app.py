import sys

from flask_migrate import Migrate

sys.path.append('.')

import globals
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
import os

local_mode = len(sys.argv) == 2 and sys.argv[1] == 'local'

if not local_mode:
    critical_env = ['MYSQL_USER', 'MYSQL_PASSWORD', 'FLASK_KEY']
    for env in critical_env:
        if env not in os.environ or len(os.environ[env]) == 0:
            raise Exception("Missing critical env " + env)

MYSQL_USER = '' if local_mode else os.environ['MYSQL_USER']
MYSQL_PASSWORD = '' if local_mode else os.environ['MYSQL_PASSWORD']
FLASK_KEY = '' if local_mode else os.environ['FLASK_KEY']
theapp = None


def create_app():
    app = Flask(__name__)
    app.secret_key = FLASK_KEY
    if not local_mode:
        app.config[
            'SQLALCHEMY_DATABASE_URI'] = 'mysql+mysqldb://' + MYSQL_USER + ':' + \
                                         MYSQL_PASSWORD + '@localhost/passgen_py?charset=utf8mb4'
    else:
        app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///test.db'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    globals.db = SQLAlchemy(app)
    globals.app = app
    migrate = Migrate(app, globals.db)
    from . import auth, passgen
    app.register_blueprint(auth.bp)
    app.register_blueprint(passgen.bp)

    # install libmysqlclient-dev!
    global theapp
    theapp = app

    return app

