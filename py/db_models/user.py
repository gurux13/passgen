from flask_sqlalchemy import SQLAlchemy as sa
from globals import db

class User(db.Model):
    __tablename__ = 'user'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    login = db.Column(db.String(32))
    lastlogin = db.Column(db.TIMESTAMP)
    passhash = db.Column(db.String(128))
    lastresource_id = db.Column(db.Integer, db.ForeignKey('resource.id', use_alter=True))
    lasthash = db.Column(db.String(32))