import functools
import json

import dataclasses
from flask import (
    Blueprint, flash, g, redirect, render_template, request, session, url_for, make_response
)

from auth import login_required
from db_models.user import User
from db_models.variant import Resource, ResourceAccount
from globals import db, app
from models.ui_variant import ResourceModel, ResourceAccountModel
from wrappers import db_view

bp = Blueprint('passgen', __name__)

@bp.route('/', )
@db_view
def index():
    # return '<br>'.join([x.resource for x in db.session.query(Variant)])

    return render_template('index.html')

@bp.route('/resources')
@db_view
def resources():
    return "Hello, resources"

class EnhancedJSONEncoder(json.JSONEncoder):
        def default(self, o):
            if dataclasses.is_dataclass(o):
                return dataclasses.asdict(o)
            return super().default(o)

@bp.route('/batchresources')
@db_view
@login_required
def batchresources():
    all_resources = db.session.query(Resource).filter_by(login_id=g.user.id)
    all_resources_model = map(
        lambda db:
            ResourceModel(
                db.id,
                db.default_account_id,
                [ResourceAccountModel(x.id, x.pass_part, x.human_readable, x.revision) for x in db.accounts],
                db.name,
                db.url,
                db.comment,
                db.length,
                db.letters,
                db.digits,
                db.symbols,
                db.underscore,
            ), all_resources)
    response = app.response_class(
        response=json.dumps(list(all_resources_model), cls=EnhancedJSONEncoder),
        status=200,
        mimetype='application/json'
    )
    return response