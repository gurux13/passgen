# SET FOREIGN_KEY_CHECKS = 0;
# SET @tables = NULL;
# SELECT GROUP_CONCAT('`', table_schema, '`.`', table_name, '`') INTO @tables
#   FROM information_schema.tables
#   WHERE table_schema = 'passgen_py'; -- specify DB name here.
# SET @tables = CONCAT('DROP TABLE ', @tables);
# PREPARE stmt FROM @tables;
# EXECUTE stmt;
# DEALLOCATE PREPARE stmt;
# SET FOREIGN_KEY_CHECKS = 1;
#
#
# $env:MYSQL_USER='passgen'
# $env:MYSQL_PASSWORD='SgfWIaia'
# $env:FLASK_KEY='blah'
# rm -r .\migrations\; flask db init; flask db migrate; flask db upgrade


from flask_script import Manager
from flask_migrate import Migrate, migrate
from db_models import *

from globals import app, db

migrate = Migrate(app, db)
manager = Manager(app)
manager.add_command('db', migrate)

if __name__ == '__main__':
    manager.run()