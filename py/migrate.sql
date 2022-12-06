truncate table `passgen_py`.`user`;
truncate table passgen_py.resource_account ;
truncate table `passgen_py`.resource;

INSERT INTO `passgen_py`.`user`
(`id`,
`login`,
`lastlogin`,
`passhash`,
`lastresource_id`,
`lasthash`)
VALUES
('1', 'gurux13', '2022-06-05 08:30:36', 'pbkdf2:sha256:260000$YZjC0YcpgNOpYHry$fb5dc2b0d236275a57088a805cccd58f859ef2f6eb12b635a102234192961bb3', NULL, NULL),
('2', 'anna2604', '2022-06-05 11:35:07', 'pbkdf2:sha256:260000$8dBFM4NDHA3mtxKM$e2d95d5b55949e2a60b00e9004292634e021d6632982eea89376de6c9293d780', NULL, NULL);

INSERT INTO `passgen_py`.`resource`
(`login_id`,
`default_account_id`,
`name`,
`url`,
`comment`)
SELECT
	`variants`.`login_id`,
    NULL,
    `variants`.`resource`,
    `variants`.`resource`,
    ''
FROM `passgen`.`variants`
WHERE `variants`.`login_id` IN (
    select id from `passgen_py`.`user`
);

INSERT INTO `passgen_py`.`resource_account`
(
`resource_id`,
`pass_part`,
`length`,
`letters`,
`digits`,
`symbols`,
`underscore`,
`revision`)
SELECT
    resource.id,
    variants.resource,
    `variants`.`length`,
    `variants`.`letters`,
    `variants`.`digits`,
    `variants`.`symbols`,
    `variants`.`underscore`,
    `variants`.`revision`
FROM `passgen`.`variants`, passgen_py.resource
where variants.resource = resource.name;