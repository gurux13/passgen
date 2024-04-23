import sys
from os import environ, getcwd

sys.path.insert(0,'/opt/passgen')

environ['MYSQL_USER'] = 'passgen'
environ['MYSQL_PASSWORD'] = '163264'
environ['FLASK_KEY'] = 'blah'


from app import create_app
application=create_app()