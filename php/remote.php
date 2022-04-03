<?php
error_reporting(E_ALL & ~E_DEPRECATED);
ini_set("display_errors", 1);
require_once 'util.php';
if (!is_logged_in()) {
    die("{}");
}
ensure_login();

$signature = "";
if (isset ( $_SESSION ['signature'] ))
	$signature = $_SESSION ['signature'];

$signature_safe = mysqli_real_escape_string ($link, $signature );
$res = mysqli_query ( $link, "select * from logins where signature='$signature_safe'" ) or die (mysql_error());
if (mysqli_num_rows ( $res ) != 1)
	nologin ();
$login_info = mysqli_fetch_assoc ( $res );
$username = $login_info ['login'];
$lastresource = $login_info ['lastresource'];
$id = $login_info ['id'];
mysqli_query ( $link, "update logins set lastlogin=current_timestamp() where id=$id" ) or die (mysql_error());
$params = array (
		'resource',
		'length',
		'revision',
		'letters',
		'digits',
		'symbols',
		'underscore'
);
$bools = array (
		"letters",
		'digits',
		'symbols',
		'underscore'
);
$ints = array(
		'length',
		'revision'
);
if (isset ( $_REQUEST ['resource'] )) {

	foreach ( $params as $p ) {
		if (isset ( $_REQUEST ["$p"] ))
			$$p = $_REQUEST ["$p"];
		else
			$$p = "";
		$safename = $p . "_safe";
		$$safename = mysqli_real_escape_string ( $link, $$p );
	}

	foreach ( $bools as $b ) {
		if ($$b && $$b !== 'false')
			$$b = "true";
		else
			$$b = "false";
	}
	foreach ($ints as $i)
	{
		$$i = intval($$i);
	}
	if (isset($_REQUEST['rm'])) {
		mysqli_query($link, "delete from variants where login_id = $id and resource = '$resource_safe'") or die (mysql_error());
	}
	else {
		$old_var_res = mysqli_query ( $link, 
<<<END
			insert into variants set
				login_id = $id,
				resource = '$resource_safe',
				length = $length,
				revision = $revision,
				letters = $letters,
				digits = $digits,
				symbols = $symbols,
				underscore = $underscore
			on duplicate key update
				length = $length,
				revision = $revision,
				letters = $letters,
				digits = $digits,
				symbols = $symbols,
				underscore = $underscore
END
		) or die ( mysql_error () );
		mysqli_query($link, "update logins set lastresource='$resource_safe' where id=$id") or die(mysql_error());
	}
	die ( '{"Status":"OK"}' );
}
$lastresource_safe = mysqli_real_escape_string($link, $lastresource);
$last_var_res = mysqli_query($link, "select * from variants where login_id = $id and resource = '$lastresource_safe'") or die(mysql_error());
$rv = '{"Status":"OK",';
function row2json($row)
{
	global $params;
	global $bools;
	$first = true;
	$rv = "";
	foreach ($params as $param) {

		$value = $row[$param];
		if (in_array($param, $bools))
		{
			$value = $value ? 'true' : 'false';
		}
		else $value = json_encode($value);
		if (!$first)
			$rv .= ",";
		$first = false;
		$rv .= '"'.$param.'":'.$value;
	}
	return $rv;
}

if (mysqli_num_rows($last_var_res) == 1)
{
	$last_var = mysqli_fetch_assoc($last_var_res);
	$rv .= row2json($last_var).",";
}
if (isset($_REQUEST['all'])){
	$rv .= '"all":[';
	$all_var_res = mysqli_query($link, "select * from variants where login_id = $id") or die(mysql_error());
	$row = array();
	$first = true;
	while ($row = mysqli_fetch_assoc($all_var_res))
	{
		if (!$first)
			$rv .= ",";
		$first = false;
		$rv .= '{'.row2json($row)."}";
	}
	$rv .= "]";
}
$rv .= "}";
die($rv);
?>
