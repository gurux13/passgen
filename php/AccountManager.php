<?php

class AccountManager
{
    private $dbLink;
    public function __construct($dblink) {
        $this->dbLink = $dblink;
    }
    public function ensureLogin() {
        if(!isset($_SESSION))
        {
            session_start();
        }
        if (!isset($_SESSION['signature']) || !isset($_SESSION['login'])) {
            $this->gtfo();
        }
        $username = $_SESSION['login'];
        if ($username !== mysqli_real_escape_string($this->dbLink, $username)) {
            $this->gtfo();
        }
        $signature = $_SESSION['signature'];
        if ($signature !== mysqli_real_escape_string($this->dbLink, $signature)) {
            $this->gtfo();
        }
        $result = mysqli_query($this->dbLink, "select count(login) as c from logins where login = '$username' and signature = '$signature'") or die(mysqli_error($this->dbLink));
        $row = mysqli_fetch_assoc($result);
        if ($row['c'] != 1) {
            $this->gtfo();
        }
    }
    
    private function gtfo() {
        header("Location: login.php");
        die('<a href="login.php">Please login</a>');
    }
}

