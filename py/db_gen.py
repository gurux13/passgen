from flask_script import Manager
from flask_migrate import Migrate, migrate
from db_models import *

from globals import app, db

migrate = Migrate(app, db)
manager = Manager(app)
manager.add_command('db', migrate)

if __name__ == '__main__':
    manager.run()