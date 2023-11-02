import functools
import json
import time

import dataclasses
from datetime import datetime

from flask import (
    Blueprint, flash, g, redirect, render_template, request, session, url_for, make_response
)

from auth import login_required
from db_models.user import User
from db_models.variant import Resource, ResourceAccount
from globals import db, app
from models.ui_variant import ResourceModel, ResourceAccountModel, account_comp_key, resource_comp_key
from models.userinfo import UserInfoModel
from utils.db_helper import set_from_model
from wrappers import db_view

bp = Blueprint('passgen', __name__)


@bp.route('/', )
@db_view
@login_required
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


def get_all_data():
    user = db.session.query(User).filter_by(id=g.user.id)[0]
    userinfo = UserInfoModel(
        g.user.id,
        user.lastresource_id,
        user.lasthash
    )
    all_resources = db.session.query(Resource).filter_by(login_id=g.user.id)
    dt_to_ts = lambda dt: None if dt is None else datetime.timestamp(dt)
    all_resources_model = map(
        lambda db:
        ResourceModel(
            db.id,
            db.last_account_id,
            sorted(
                [ResourceAccountModel(x.id, x.pass_part, x.human_readable, x.revision, x.lasthash, dt_to_ts(x.last_used_on)) for x
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
    return {'resources': list(all_resources_model), 'userinfo': userinfo}


@bp.route('/newurl', methods=['POST'])
@db_view
@login_required
def new_url():
    data = json.loads(request.data)
    print(data)
    resources = list(db.session.query(Resource).filter_by(id = data['resource_id']))

    if len(resources) != 1 or resources[0].login_id != g.user.id:
        return app.response_class("Access denied", status=403)
    resources[0].url = data['url']
    db.session.commit()
    return app.response_class('"OK"', status=200)

@bp.route('/batchresources')
@db_view
@login_required
def batchresources():
    data = get_all_data()
    response = app.response_class(
        response=json.dumps(data, cls=EnhancedJSONEncoder),
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
    if 'resource' not in data or 'account' not in data:
        return batchresources()
    client_resource = ResourceModel(accounts=None, **data['resource'])
    if client_resource.id is None:
        resource = Resource()
        resource.login_id = g.user.id
        db.session.add(resource)
    else:
        resources = list(db.session.query(Resource).filter_by(id=client_resource.id))
        if len(resources) == 0 or resources[0].login_id != g.user.id:
            return batchresources()
        resource: Resource = resources[0]

    client_account = ResourceAccountModel(**data['account'])
    if client_account.id is None:
        account = ResourceAccount()
        account.resource = resource
        db.session.add(account)
    else:
        if resource.id is None:
            return batchresources()
        accounts = list(db.session.query(ResourceAccount).filter_by(id=client_account.id))
        if len(accounts) == 0 or accounts[0].resource_id != resource.id:
            return batchresources()
        account: ResourceAccount = accounts[0]
    resource_no_accounts = client_resource.__dict__
    resource_no_accounts.pop("accounts")
    set_from_model(resource, resource_no_accounts)
    set_from_model(account, client_account.__dict__)
    account.last_used_on = datetime.utcnow()
    print(resource)
    user = db.session.query(User).filter_by(id=g.user.id)[0]
    user.lastresource = resource
    db.session.commit()

    db.session.refresh(resource)
    db.session.refresh(account)

    data = get_all_data()
    data['this_resource_id'] = resource.id
    data['this_account_id'] = account.id
    # time.sleep(1)
    return app.response_class(
        response=json.dumps(data, cls=EnhancedJSONEncoder),
        status=200,
        mimetype='application/json'
    )


@bp.route('/newsha', methods=['POST'])
@db_view
@login_required
def newsha():
    data = json.loads(request.data)
    account: ResourceAccount = \
        db.session.query(ResourceAccount).filter_by(id=data['account_id'], resource_id=data['resource_id'])[0]
    if account.resource.login_id != g.user.id:
        return redirect(url_for('auth.login'))
    print("Found account:", account)

    if data['global']:
        print("Saving global sha")
        user = db.session.query(User).filter_by(id=g.user.id)[0]
        user.lasthash = data['sha']
        account.lasthash = None
        db.session.commit()
    else:
        account.lasthash = data['sha']
        db.session.commit()
    print(request.data)
    # time.sleep(1)
    return batchresources()
