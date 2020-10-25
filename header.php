<?php 
error_reporting(E_ALL & ~E_DEPRECATED);
ini_set("display_errors", 1);
require_once 'db.php';
if (isset($_REQUEST['remote'])) {
	require 'remote.php';
	die();
}
session_start();
if (isset($_SESSION['signature'])) {
	setcookie("signature", $_SESSION['signature']);
}
if (isset($_COOKIE['signature'])) {
	$_SESSION['signature'] = $_COOKIE['signature'];
}
header("Content-Type: text/html; charset=utf-8");
?>
<head>
<title>Password generation by gurux13</title>
<script src="js/jquery.js" type="text/javascript"></script>
<script src="js/sha.js" type="text/javascript"></script>
<script src="js/scripts.js?seed=1" type="text/javascript"></script>
<style type="text/css" href="" src="css/styles.css"></style>
<meta charset="utf-8">
<meta name="Content-type" content="text/html; charset=utf8">
<link rel="stylesheet" type="text/css" href="css/styles.css">

<!--
a.res-control a.res {
	text-decoration: none;
	color: #96F;
	
}
a.res-control {
	font-size: small;
}
div.res-list {
	display: none;
	margin: 5px;
	position: absolute;
	background-color: white;
	z-index: 2;
}
div.cover {
	display: none;
	position: fixed;
	left: 0;
	top: 0;
	bottom: 0;
	
	right: 0;
	z-index: 1;
	background-color: black;
	opacity: 0.5;
}
table {
	border-collapse: collapse;
}
.cb {
	cursor: default;
}
.resulting {
	font-weight: bold;
	background-color: #9FA
}
table td {
	padding: 7px;
	border: 1px dashed #BE9;
}

.passes td {
	border: 1px solid black;
	padding: 5px;
}

body {
	background-color: #CFA
}

.input-master {
	background-color: #AFF
}
input[type=text], input[type=password] {
	width: 100%
}
-->
</style>
</head>
