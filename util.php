<?php
require_once "db.php";
function gtfo() {
	header("Location: login.php");
	die('<a href="login.php">Please login</a>');
}

function ensure_login() {
	global $link;
    if(!isset($_SESSION)) 
    { 
        session_start(); 
    } 
	if (!isset($_SESSION['signature']) || !isset($_SESSION['login'])) {
		gtfo();
	}
	$username = $_SESSION['login'];
	if ($username !== mysqli_real_escape_string($link, $username)) {
		gtfo();
	}
	$signature = $_SESSION['signature'];
	if ($signature !== mysqli_real_escape_string($link, $signature)) {
		gtfo();
	}
	$result = mysqli_query($link, "select count(login) as c from logins where login = '$username' and signature = '$signature'") or die(mysql_error());
	$row = mysqli_fetch_assoc($result);
	if ($row['c'] != 1) {
		gtfo();
	}
}
?>
