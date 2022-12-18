# $env:MYSQL_USER='passgen'
# $env:MYSQL_PASSWORD='163264'
# $env:FLASK_KEY='blah'
# rm -r .\migrations\;$env:SCRIPT='erase.sql'; (type run_script.py | flask shell); flask db init; flask db migrate; flask db upgrade;$env:SCRIPT='migrate.sql'; (type run_script.py | flask shell);


from flask_script import Manager
from flask_migrate import Migrate, migrate
from db_models import *

from globals import app, db

migrate = Migrate(app, db)
manager = Manager(app)
manager.add_command('db', migrate)
if __name__ == '__main__':
    manager.run()