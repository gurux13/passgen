from flask_sqlalchemy import SQLAlchemy as sa
from globals import db

class User(db.Model):
    __tablename__ = 'logins'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    login = db.Column(db.String(32))
    lastlogin = db.Column(db.TIMESTAMP)
    signature = db.Column(db.String(128))
    lastresource = db.relationship("Resouce")