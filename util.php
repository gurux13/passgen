<?php
require_once "db.php";
function gtfo() {
	header("Location: index.php?logout");
	die('<a href="login.php">Please login</a>');
}

function parse_cookie_signature() {
    global $link;
    if (isset($_COOKIE['signature'])) {
        $signature = $_COOKIE['signature'];
        if (!$signature) {
            return;
        }
        if ($signature !== mysqli_real_escape_string($link, $signature)) {
            return false;
        }
        $result = mysqli_query($link, "select login as l from logins where signature = '$signature'") or die(mysql_error());
        if ($result->num_rows !== 1) {
            return;
        }
        $row = mysqli_fetch_assoc($result);
        if (isset($row['l'])) {
            $_SESSION['login'] = $row['l'];
            $_SESSION['signature'] = $signature;
        }
    }
}

function is_logged_in() {
    global $link;
    if(!isset($_SESSION))
    {
        session_start();
    }
    parse_cookie_signature();
    if (!isset($_SESSION['signature']) || !isset($_SESSION['login'])) {
        return false;
    }
    $username = $_SESSION['login'];
    if ($username !== mysqli_real_escape_string($link, $username)) {
        return false;
    }
    $signature = $_SESSION['signature'];
    if ($signature !== mysqli_real_escape_string($link, $signature)) {
        return false;
    }
    $result = mysqli_query($link, "select count(login) as c from logins where login = '$username' and signature = '$signature'") or die(mysql_error());
    $row = mysqli_fetch_assoc($result);
    if ($row['c'] != 1) {
        return false;
    }
    return true;
}

function ensure_login() {
	global $link;
	if (!is_logged_in()) {
	    gtfo();
	}
}
?>
