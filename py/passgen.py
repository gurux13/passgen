import functools
import json
import time

import dataclasses
from flask import (
    Blueprint, flash, g, redirect, render_template, request, session, url_for, make_response
)

from auth import login_required
from db_models.user import User
from db_models.variant import Resource, ResourceAccount
from globals import db, app
from models.ui_variant import ResourceModel, ResourceAccountModel, account_comp_key, resource_comp_key
from models.userinfo import UserInfoModel
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
    user = db.session.query(User).filter_by(id=g.user.id)[0]
    userinfo = UserInfoModel(
        g.user.id,
        user.lastresource_id,
        user.lasthash
    )
    all_resources = db.session.query(Resource).filter_by(login_id=g.user.id)
    all_resources_model = map(
        lambda db:
        ResourceModel(
            db.id,
            db.last_account_id,
            sorted(
                [ResourceAccountModel(x.id, x.pass_part, x.human_readable, x.revision, x.lasthash, x.last_used_on) for x
                 in db.accounts], key=account_comp_key),
            db.name,
            db.url,
            db.comment,
            db.length,
            db.letters,
            db.digits,
            db.symbols,
            db.underscore,
        ), all_resources)
    all_resources_model = sorted(all_resources_model, key=resource_comp_key)
    response = app.response_class(
        response=json.dumps({'resources': list(all_resources_model), 'userinfo': userinfo}, cls=EnhancedJSONEncoder),
        status=200,
        mimetype='application/json'
    )
    return response


@bp.route('/generated', methods=['POST'])
@db_view
@login_required
def generated():
    data = json.loads(request.data)
    print(request.data)
    time.sleep(1)
    return batchresources()


@bp.route('/newsha', methods=['POST'])
@db_view
@login_required
def newsha():
    data = json.loads(request.data)
    if data['global']:
        print("Saving global sha")
        user = db.session.query(User).filter_by(id=g.user.id)[0]
        user.lasthash = data['sha']
        db.session.commit()
    else:
        account = db.session.query(ResourceAccount).filter_by(id=data['account_id'], resource_id=data['resource_id'])[0]
        print("Found account:", account)
        account.lasthash = data['sha']
        db.session.commit()
    print(request.data)
    time.sleep(1)
    return batchresources()
