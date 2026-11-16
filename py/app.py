import sys

from flask_migrate import Migrate

sys.path.append('.')

import globals
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
import os

# os.environ['MYSQL_USER'] = 'passgen'
# os.environ['MYSQL_PASSWORD'] = '123456q'
# os.environ['FLASK_KEY'] = 'blah'

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
                                         MYSQL_PASSWORD + '@localhost/passgen?charset=utf8mb4'
    else:
        app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///test.db'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    globals.db = SQLAlchemy(app)
    globals.app = app
    migrate = Migrate(app, globals.db)
    #from . import auth, passgen
    import auth, passgen
    app.register_blueprint(auth.bp)
    app.register_blueprint(passgen.bp)

    @app.after_request
    def no_transform(response):
        # Proxies (e.g. Cloudflare's JavaScript detections) must not modify pages:
        # the genpw.cc browser extension checks them against pinned hashes.
        response.cache_control.no_transform = True
        return response

    # install libmysqlclient-dev!
    global theapp
    theapp = app

    return app

