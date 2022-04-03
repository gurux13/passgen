import functools

from flask import (
    Blueprint, flash, g, redirect, render_template, request, session, url_for
)

from db_models.user import User
from db_models.variant import Resouce, ResourceVariation
from globals import db

bp = Blueprint('passgen', __name__)

@bp.route('/', )
def index():
    return '<br>'.join([x.resource for x in db.session.query(Variant)])

    return render_template('index.html')

@bp.route('/resources')
def resources():
    return "Hello, resources"