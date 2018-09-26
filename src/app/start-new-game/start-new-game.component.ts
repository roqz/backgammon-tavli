import { Component, OnInit } from "@angular/core";
import { Router } from "@angular/router";

@Component({
  selector: "start-new-game",
  templateUrl: "./start-new-game.component.html",
  styleUrls: ["./start-new-game.component.scss"]
})
export class StartNewGameComponent implements OnInit {

  constructor(private router: Router) { }

  ngOnInit() {
  }

   startGame() {
    this.router.navigate(["/game"]);
  }
}
